import { Modal, Progress } from "antd";
import { loadProgress } from "../logic/HytaleApi";
import { useObservable } from "../utils/UseObservable";

const ProcesModal = () => {
    const progress = useObservable(loadProgress);

    return (
        <Modal
            title="Loading Hytale Jar"
            open={progress !== undefined}
            footer={null}
            closable={false}
        >
            <Progress percent={progress ?? 0} />
        </Modal>
    );
};

export default ProcesModal;